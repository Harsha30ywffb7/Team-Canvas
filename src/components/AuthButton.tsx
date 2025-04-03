"use client";
import React from "react";
import { signIn, signOut, useSession } from "next-auth/react";

export default function AuthButton() {
  const { data: session } = useSession();
  return (
    <div>
      {session ? (
        <div className="flex justify-between gap-4 items-center">
          <p>Welcome , {session.user?.name}</p>
          <button
            onClick={() => signOut}
            className="cursor-pointer bg-white text-black rounded-lg px-2 py-1"
          >
            signOut
          </button>
        </div>
      ) : (
        <button onClick={() => signIn("google")} className="cursor-pointer">
          signIn
        </button>
      )}
    </div>
  );
}
