const prisma = require("../config/prisma");
const AppError = require("../utils/appError");
const { roleHasPermission } = require("../utils/roleAccess");
const { PERMISSIONS } = require("../constants/permissions");

const isUserSenior = (user) => {
  if (!user) return false;
  const classification = String(user.incentiveClassification || "").toUpperCase();
  const role = String(user.role || "").toUpperCase();
  return (
    classification === "SENIOR_SALES_AGENT" ||
    classification === "SENIOR_TECHNICIAN" ||
    classification.startsWith("SENIOR_") ||
    role.startsWith("SENIOR_")
  );
};

const userHasPermission = async (user, permission, client = prisma) => {
  if (!user) return false;

  // Senior classification has purchase order & receiving permissions
  if (isUserSenior(user)) {
    if (
      permission === PERMISSIONS.VIEW_PURCHASE_ORDERS ||
      permission === PERMISSIONS.MANAGE_PURCHASE_ORDERS ||
      permission === PERMISSIONS.VIEW_PURCHASE_RECEIVINGS ||
      permission === PERMISSIONS.MANAGE_PURCHASE_RECEIVINGS
    ) {
      return true;
    }
  }

  // Cash custodian dynamic check (if user is assigned cash custodian in DB or role)
  if (
    permission === PERMISSIONS.MANAGE_CASH_BOX ||
    permission === PERMISSIONS.VIEW_CASH_BOX ||
    permission === PERMISSIONS.CONFIRM_CASH_HANDOVER
  ) {
    if (user.role === "CASH_CUSTODIAN") {
      return true;
    }
    if (user.id && user.branchId) {
      const assignment = await client.cashCustodianAssignment.findFirst({
        where: {
          userId: user.id,
          branchId: user.branchId,
          endedAt: null,
        },
        select: { id: true },
      });
      if (assignment) {
        return true;
      }
    }
  }

  return roleHasPermission(user.role, permission);
};

const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(
          new AppError(
            "Authentication is required",
            401,
            "AUTHENTICATION_REQUIRED"
          )
        );
      }

      const allowed = await userHasPermission(req.user, permission);

      if (!allowed) {
        return next(
          new AppError(
            "Account restricted: You do not have permission to perform this action.",
            403,
            "ACCOUNT_RESTRICTED"
          )
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

const requireAnyPermission = (permissions = []) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(
          new AppError(
            "Authentication is required",
            401,
            "AUTHENTICATION_REQUIRED"
          )
        );
      }

      let allowed = false;
      for (const permission of permissions) {
        if (await userHasPermission(req.user, permission)) {
          allowed = true;
          break;
        }
      }

      if (!allowed) {
        return next(
          new AppError(
            "Account restricted: You do not have permission to perform this action.",
            403,
            "ACCOUNT_RESTRICTED"
          )
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = {
  requirePermission,
  requireAnyPermission,
  isUserSenior,
  userHasPermission,
};
