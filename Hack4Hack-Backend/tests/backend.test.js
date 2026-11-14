import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable, Transform } from "node:stream";

// Validators
import { createSubmissionSchema } from "../validators/submissionSchema.js";
import {
  initiateUploadSchema,
  signPartSchema,
  completeUploadSchema,
} from "../validators/uploadSchema.js";

// Middleware & Controllers
import { attachTeam } from "../middlewares/attachTeam.js";
import { createSubmission } from "../controllers/submissionController.js";
import {
  inspectArchiveStream,
  MAX_FILE_ENTRIES,
  MAX_ENTRY_SIZE_BYTES,
} from "../services/archiveValidator.js";

// Models & Utils
import Team from "../models/teamModel.js";
import SubmissionVersion from "../models/submissionVersionModel.js";
import FileAsset from "../models/fileAssetModel.js";
import AppError from "../utils/AppError.js";
import unzipper from "unzipper";

vi.mock("../queues/submissionQueue.js", () => ({
  getSubmissionQueue: () => ({
    getJob: vi.fn().mockResolvedValue(null),
    add: vi.fn().mockResolvedValue({ id: "test-job" }),
  }),
}));
vi.mock("../services/auditService.js", () => ({ logAuditEvent: vi.fn().mockResolvedValue(null) }));

describe("Express Backend Test Suite - 20 Vitest Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Zod Validators (6 tests)
  // =========================================================================
  describe("Zod Validators", () => {
    it("1. createSubmissionSchema: should accept a valid submission payload", () => {
      const payload = {
        fileId: "65b1234567890abcdef12345",
        title: "Deadline Crush Solver",
        description: "High concurrency micro-batching engine",
        repoUrl: "https://github.com/team/deadline-crush",
        liveDemoUrl: "https://demo.deadlinecrush.dev",
      };
      const result = createSubmissionSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Deadline Crush Solver");
      }
    });

    it("2. createSubmissionSchema: should reject missing or empty fileId", () => {
      const payload = {
        fileId: "",
        title: "Valid Title",
      };
      const result = createSubmissionSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.includes("fileId"))).toBe(
        true,
      );
    });

    it("3. createSubmissionSchema: should reject title shorter than 2 characters and invalid URL formats", () => {
      const shortTitleResult = createSubmissionSchema.safeParse({
        fileId: "file_123",
        title: "A",
      });
      expect(shortTitleResult.success).toBe(false);

      const invalidUrlResult = createSubmissionSchema.safeParse({
        fileId: "file_123",
        title: "Valid Title",
        repoUrl: "not-a-valid-http-url",
      });
      expect(invalidUrlResult.success).toBe(false);
    });

    it("4. createSubmissionSchema: should accept optional and empty string fields for urls", () => {
      const payload = {
        fileId: "file_123",
        title: "Valid Title",
        repoUrl: "",
        liveDemoUrl: "",
      };
      const result = createSubmissionSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("5. initiateUploadSchema: should accept allowed archive formats and reject non-archive extensions", () => {
      const validExtensions = [
        "archive.zip",
        "data.tar.gz",
        "build.tgz",
        "bundle.tar",
      ];
      for (const fileName of validExtensions) {
        const res = initiateUploadSchema.safeParse({
          fileName,
          fileSizeBytes: 2048,
          partCount: 2,
        });
        expect(res.success).toBe(true);
      }

      const invalid = initiateUploadSchema.safeParse({
        fileName: "malicious.exe",
        fileSizeBytes: 2048,
        partCount: 2,
      });
      expect(invalid.success).toBe(false);
    });

    it("6. signPartSchema and completeUploadSchema: should enforce part number bounds and non-empty parts list", () => {
      const invalidPart = signPartSchema.safeParse({
        fileId: "file_123",
        partNumber: 0,
      });
      expect(invalidPart.success).toBe(false);

      const validPart = signPartSchema.safeParse({
        fileId: "file_123",
        partNumber: 5,
      });
      expect(validPart.success).toBe(true);

      const emptyParts = completeUploadSchema.safeParse({
        fileId: "file_123",
        parts: [],
      });
      expect(emptyParts.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. attachTeam Middleware (4 tests)
  // =========================================================================
  describe("attachTeam Middleware", () => {
    it("7. should return 401 AppError if req.user or req.user._id is missing", async () => {
      const req = {};
      const res = {};
      const next = vi.fn();

      await attachTeam(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe("Not authenticated");
    });

    it("8. should return 404 AppError if no team is found for the user", async () => {
      const req = { user: { _id: "user_without_team" } };
      const res = {};
      const next = vi.fn();

      vi.spyOn(Team, "findById").mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      await attachTeam(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("No team associated with your account");
    });

    it("9. should attach team to req.team and call next() when team exists", async () => {
      const fakeTeam = { _id: "team_123", name: "Alpha Squad" };
      const req = { user: { _id: "user_with_team" } };
      const res = {};
      const next = vi.fn();

      vi.spyOn(Team, "findById").mockReturnValue({
        lean: vi.fn().mockResolvedValue(fakeTeam),
      });

      await attachTeam(req, res, next);

      expect(req.team).toEqual(fakeTeam);
      expect(next).toHaveBeenCalledWith();
    });

    it("10. should forward database error to next if Team.findById throws", async () => {
      const req = { user: { _id: "user_error" } };
      const res = {};
      const next = vi.fn();
      const dbError = new Error("Database connection failure");

      vi.spyOn(Team, "findById").mockReturnValue({
        lean: vi.fn().mockRejectedValue(dbError),
      });

      await attachTeam(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // =========================================================================
  // 3. archiveValidator (4 tests)
  // =========================================================================
  describe("archiveValidator", () => {
    const validZipHeader = Buffer.from([
      0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    it("11. should validate a genuine ZIP archive stream and return valid: true", async () => {
      const bodyStream = Readable.from([validZipHeader]);
      const result = await inspectArchiveStream(validZipHeader, bodyStream);

      expect(result.valid).toBe(true);
      expect(result.detectedMimeType).toBe("application/zip");
      expect(result.errors).toEqual([]);
      expect(result.contentHashSha256).toBeDefined();
    });

    it("12. should reject an invalid archive (non-zip buffer / signature) with valid: false", async () => {
      const nonZipBuffer = Buffer.from(
        "random uncompressed text content or pdf magic bytes",
      );
      const bodyStream = Readable.from([nonZipBuffer]);
      const result = await inspectArchiveStream(nonZipBuffer, bodyStream);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Only ZIP archives are supported");
      expect(result.detectedMimeType).not.toBe("application/zip");
    });

    it("13. should reject a zip bomb that exceeds single entry or total uncompressed byte limits", async () => {
      vi.spyOn(unzipper, "Parse").mockImplementation(() => {
        const transform = new Transform({ objectMode: true });
        transform._transform = function (chunk, encoding, callback) {
          callback();
        };
        transform._flush = function (callback) {
          this.push({
            type: "File",
            path: "massive_bomb.txt",
            async *[Symbol.asyncIterator]() {
              yield Buffer.alloc(1024);
              yield Buffer.alloc(MAX_ENTRY_SIZE_BYTES + 1024);
            },
          });
          callback();
        };
        return transform;
      });

      const bodyStream = Readable.from([validZipHeader]);
      const result = await inspectArchiveStream(validZipHeader, bodyStream);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (err) => err.includes("exceeds maximum") || err.includes("size"),
        ),
      ).toBe(true);
    });

    it("14. should reject a zip bomb with excessive number of file entries", async () => {
      vi.spyOn(unzipper, "Parse").mockImplementation(() => {
        const transform = new Transform({ objectMode: true });
        transform._transform = function (chunk, encoding, callback) {
          callback();
        };
        transform._flush = function (callback) {
          for (let i = 0; i <= MAX_FILE_ENTRIES + 1; i++) {
            this.push({
              type: "File",
              path: `nested_file_${i}.txt`,
              async *[Symbol.asyncIterator]() {
                yield Buffer.from("tiny");
              },
            });
          }
          callback();
        };
        return transform;
      });

      const bodyStream = Readable.from([validZipHeader]);
      const result = await inspectArchiveStream(validZipHeader, bodyStream);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("ZIP contains too many entries");
    });
  });

  // =========================================================================
  // 4. createSubmission Controller (6 tests)
  // =========================================================================
  describe("createSubmission Controller", () => {
    it("15. should throw 400 AppError when submission payload fails Zod validation", async () => {
      const req = {
        body: { fileId: "", title: "X" },
        headers: {},
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await expect(createSubmission(req, res)).rejects.toThrow(AppError);
    });

    it("16. should throw an error when team is missing from request", async () => {
      const req = {
        body: {
          fileId: "65b1234567890abcdef12345",
          title: "Valid Submission Title",
          idempotencyKey: "test-version-17",
        },
        headers: {},
        user: { _id: "user_123" },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await expect(createSubmission(req, res)).rejects.toThrow();
    });

    it("17. should throw 404 AppError when team is not found in database", async () => {
      const req = {
        body: {
          fileId: "65b1234567890abcdef12345",
          title: "Valid Submission Title",
          idempotencyKey: "test-version-17b",
        },
        headers: {},
        user: { _id: "user_123" },
        team: { _id: "nonexistent_team_id" },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      vi.spyOn(FileAsset, "findOne").mockResolvedValue({
        _id: "65b1234567890abcdef12345",
        status: "COMPLETED",
        initiatedAt: new Date(),
        deadlineAtInitiate: new Date(Date.now() + 86400000),
        hardCutoffAtInitiate: new Date(Date.now() + 86400000 + 300000),
      });
      vi.spyOn(SubmissionVersion, "findOne").mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      vi.spyOn(Team, "findOneAndUpdate").mockResolvedValue(null);

      await expect(createSubmission(req, res)).rejects.toThrow(AppError);
      await expect(createSubmission(req, res)).rejects.toThrow(
        "Team not found",
      );
    });

    it("18. should return 200 with idempotent replay when idempotencyKey already exists", async () => {
      const existingSubmission = {
        _id: "65b1234567890abcdef12346",
        versionNumber: 3,
        validationStatus: "VALID",
        submittedAt: new Date("2026-11-10T12:00:00Z"),
        isLate: false,
      };

      const req = {
        body: {
          fileId: "65b1234567890abcdef12345",
          title: "Valid Submission Title",
          idempotencyKey: "idem-key-abc-123",
        },
        headers: {},
        user: { _id: "user_123" },
        team: { _id: "team_123" },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      vi.spyOn(SubmissionVersion, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue(existingSubmission),
      });

      await createSubmission(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Submission version already exists (idempotent replay)",
          versionNumber: 3,
        }),
      );
    });

    it("19. should process a valid new submission and enqueue job", async () => {
      const req = {
        body: {
          fileId: "65b1234567890abcdef12345",
          title: "Valid Title",
          idempotencyKey: "test-version-19",
          repoUrl: "https://github.com/test",
        },
        headers: {},
        user: { _id: "user_123" },
        team: { _id: "team_123" },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      vi.spyOn(FileAsset, "findOne").mockResolvedValue({
        _id: "file_1",
        status: "COMPLETED",
        initiatedAt: new Date(),
        deadlineAtInitiate: new Date(Date.now() + 86400000),
        hardCutoffAtInitiate: new Date(Date.now() + 86400000 + 300000),
      });
      vi.spyOn(SubmissionVersion, "findOne").mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      vi.spyOn(Team, "findOneAndUpdate").mockResolvedValue({
        _id: "team_123",
        latestVersionNumber: 1,
      });
      vi.spyOn(SubmissionVersion, "create").mockResolvedValue({
        _id: "version_1",
        versionNumber: 1,
        validationStatus: "PENDING",
        submittedAt: new Date(),
      });
      vi.spyOn(FileAsset, "updateOne").mockResolvedValue({});

      await createSubmission(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("20. should reject if file asset is not found or not completed", async () => {
      const req = {
        body: { fileId: "65b1234567890abcdef12345", title: "Valid Title", idempotencyKey: "test-version-20" },
        headers: {},
        user: { _id: "user_123" },
        team: { _id: "team_123" },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      vi.spyOn(FileAsset, "findOne").mockResolvedValue(null);
      vi.spyOn(SubmissionVersion, "findOne").mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      await expect(createSubmission(req, res)).rejects.toThrow(
        "File not found, not owned by you, or not yet fully uploaded",
      );
    });
  });
});
