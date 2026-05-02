import { useAuth } from "./AuthContext";

const WRITE_ROLES = ["admin", "treasurer", "secretary"];

export const usePermissions = () => {
  const { role } = useAuth();

  return {
    canWrite:    WRITE_ROLES.includes(role ?? ""),
    isAdmin:     role === "admin",
    isTreasurer: role === "treasurer",
    isSecretary: role === "secretary",
    isMember:    role === "member",
    role,
  };
};