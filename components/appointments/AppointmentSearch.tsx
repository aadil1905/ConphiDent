"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function AppointmentSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(
    searchParams.get("search") ?? ""
  );
  const [status, setStatus] = useState(
  searchParams.get("status") ?? ""
);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());

      if (search.trim()) {
        params.set("search", search);
      } else {
        params.delete("search");
      }
if (status) {
  params.set("status", status);
} else {
  params.delete("status");
}
      router.push(`/dashboard/appointments?${params.toString()}`);
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, status, router, searchParams]);

 return (
  <div className="flex gap-3">
    <input
      type="text"
      placeholder="Search by patient name, phone or treatment..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="flex-1 rounded-control border px-4 py-2"
    />

    <select
      value={status}
      onChange={(e) => setStatus(e.target.value)}
      className="w-48 rounded-control border px-4 py-2"
    >
      <option value="">All Status</option>
      <option value="Pending">Pending</option>
      <option value="Confirmed">Confirmed</option>
      <option value="Completed">Completed</option>
      <option value="Cancelled">Cancelled</option>
    </select>
  </div>
);
}