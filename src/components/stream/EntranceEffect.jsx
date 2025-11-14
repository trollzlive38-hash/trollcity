import React from "react";

export default function EntranceEffect({ username }) {
  return (
    <div className="px-2 py-1 rounded bg-green-600/10 border border-green-600/30 text-green-300 text-xs">
      {username ? `${username} entered` : "Entrance"}
    </div>
  );
}

