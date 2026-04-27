import { useEffect, useReducer } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";

type State = { tenantId: string; loading: boolean };
type Action = { type: "resolved"; tenantId: string };

function reducer(_: State, action: Action): State {
  return { tenantId: action.tenantId, loading: false };
}

const INITIAL: State = { tenantId: "", loading: true };

export function useTenant() {
  const { currentUser } = useAuth();
  const [state, dispatch] = useReducer(reducer, INITIAL);

  useEffect(() => {
    let cancelled = false;

    const resolve = (tenantId: string) => {
      if (!cancelled) dispatch({ type: "resolved", tenantId });
    };

    if (!currentUser) {
      Promise.resolve().then(() => resolve(""));  // defer — never sync
      return () => { cancelled = true; };
    }

    getDoc(doc(db, "users", currentUser.uid))
      .then((snap) => resolve(snap.data()?.tenantId ?? ""))
      .catch((err) => {
        console.error("[useTenant] Failed to fetch tenant:", err);
        resolve("");
      });

    return () => { cancelled = true; };
  }, [currentUser]);

  return state;
}