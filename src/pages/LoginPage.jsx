import React from "react";
import { Link } from "react-router-dom";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white shadow-sm rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-2">Login Required</h1>
        <p className="text-sm text-gray-600 mb-4">
          You’re not signed in. Please sign in to continue, or go back to the
          home page.
        </p>
        <div className="flex gap-3">
          <Link
            to="/Home"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Home
          </Link>
          <a
            href="#"
            className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200 cursor-not-allowed"
            onClick={(e) => e.preventDefault()}
            title="Authentication UI not yet implemented"
          >
            Sign In
          </a>
        </div>
      </div>
    </div>
  );
}

