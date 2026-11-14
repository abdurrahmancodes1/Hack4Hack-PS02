import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const fixtures = JSON.parse(open("../script/load-fixtures.json")).fixtures;
const failures = new Counter("submission_failures");
const api = __ENV.API_BASE_URL || "http://localhost:4000";
const tinyZip = new Uint8Array([
  0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

export const options = {
  scenarios: {
    deadline_crush: {
      executor: "shared-iterations",
      vus: fixtures.length,
      iterations: fixtures.length,
      maxDuration: "10m",
    },
  },
  thresholds: {
    "http_req_duration{kind:api}": ["p(95)<300"],
    submission_failures: ["count==0"],
  },
};

export default function () {
  const fixture = fixtures[__VU - 1];
  if (!fixture) {
    failures.add(1);
    return;
  }
  const auth = { Authorization: `Bearer ${fixture.token}` };
  const init = http.post(`${api}/uploads/multipart/initiate`, JSON.stringify({
    fileName: "load-test.zip",
    contentType: "application/zip",
    fileSizeBytes: tinyZip.length,
    partCount: 1,
  }), {
    headers: { ...auth, "Content-Type": "application/json" },
    tags: { kind: "api" },
    timeout: "30s",
  });
  if (!check(init, { "upload initiated": (r) => r.status === 201 && r.json("success") })) {
    failures.add(1);
    return;
  }

  const upload = init.json();
  const fileId = upload.fileId;
  const part = upload.parts[0];
  const uploaded = http.put(part.presignedUrl, tinyZip.buffer, {
    headers: { "Content-Type": "application/zip" },
    tags: { kind: "storage" },
    timeout: "30s",
  });
  const etag = uploaded.headers.ETag || uploaded.headers.Etag || uploaded.headers.etag;
  if (!check(uploaded, { "archive uploaded directly to storage": (r) => r.status === 200 && Boolean(etag) })) {
    failures.add(1);
    return;
  }

  const completed = http.post(`${api}/uploads/multipart/complete`, JSON.stringify({
    fileId,
    parts: [{ partNumber: 1, etag: etag.replace(/"/g, "") }],
  }), {
    headers: { ...auth, "Content-Type": "application/json" },
    tags: { kind: "api" },
    timeout: "30s",
  });
  if (!check(completed, { "multipart upload completed": (r) => r.status === 200 })) {
    failures.add(1);
    return;
  }

  const submitted = http.post(`${api}/submissions`, JSON.stringify({
    fileId,
    title: `Load test submission ${fixture.n}`,
    description: "Submission API load-test fixture",
    repoUrl: "",
    liveDemoUrl: "",
    idempotencyKey: `load-${fileId}`,
  }), {
    headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": `load-${fileId}` },
    tags: { kind: "api" },
    timeout: "30s",
  });
  if (!check(submitted, { "submission accepted": (r) => r.status === 201 && r.json("success") === true })) {
    failures.add(1);
  }
}
