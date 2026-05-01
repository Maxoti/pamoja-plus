import { useAuth } from "./AuthContext";

const WRITE_ROLES = [ "admin", "treasurer"];

export const usePermissions = () => {
  const { role } = useAuth();

  return {
    canWrite: WRITE_ROLES.includes(role ?? ""),
    isAdmin:  role === "admin",
    isTreasurer: role === "treasurer",
    isMember: role === "member",
    role,
  };
};