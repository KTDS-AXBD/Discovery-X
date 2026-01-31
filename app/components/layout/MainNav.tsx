import { Form, Link } from "@remix-run/react";
import type { User } from "~/db/schema";

interface MainNavProps {
  user: User;
}

export function MainNav({ user }: MainNavProps) {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <Link
              to="/"
              className="flex items-center text-xl font-bold text-gray-900"
            >
              Discovery-X
            </Link>
            <div className="ml-10 flex space-x-8">
              <Link
                to="/discoveries"
                className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
              >
                Discoveries
              </Link>
              <Link
                to="/review"
                className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
              >
                Weekly Review
              </Link>
              <Link
                to="/recall"
                className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
              >
                Recall Queue
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">{user.name}</span>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
              >
                로그아웃
              </button>
            </Form>
          </div>
        </div>
      </div>
    </nav>
  );
}
