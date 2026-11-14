export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.globalRole || req.user?.role;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: "Access denied. Only Organizers can access this resource.",
      });
    }

    next();
  };
};
