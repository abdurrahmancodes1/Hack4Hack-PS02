import AuditLog from "../models/auditlogsModel.js";

export const logAuditEvent = async ({
  actorId,
  actorRole,
  action,
  entityType,
  entityId,
  teamId = null,
  details = {},
  req = null,
  session = null,
  dedupeKey = null,
}) => {
  try {
    const ipAddress = req?.ip || req?.headers?.["x-forwarded-for"] || null;
    const userAgent = req?.headers?.["user-agent"] || null;

    const logEntry = new AuditLog({
      actorId,
      actorRole: actorRole || "Participant",
      action,
      entityType,
      entityId,
      teamId,
      details,
      dedupeKey: dedupeKey || undefined,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    });

    if (dedupeKey) {
      await AuditLog.updateOne(
        { dedupeKey },
        { $setOnInsert: logEntry.toObject() },
        { upsert: true, session },
      );
      return logEntry;
    }

    if (session) {
      await logEntry.save({ session });
    } else {
      await logEntry.save();
    }
    return logEntry;
  } catch (error) {
    console.error(`Failed to record audit log [${action}]:`, error.message);
    // Non-blocking: Audit logging errors should not crash the primary operational transaction
    return null;
  }
};
