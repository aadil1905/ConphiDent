"use client";

import { Input } from "@/components/ui/input";

export default function AppointmentSearch() {
 return (
 <form action="/dashboard/appointments" method="GET">
 <div className="flex gap-2 items-center">
 <Input
 name="search"
 placeholder="Search by patient name or phone..."
 />

 <select
 name="status"
 className="border rounded-control px-3 py-2"
 >
 <option value="">All Status</option>
 <option value="Pending">Pending</option>
 <option value="Confirmed">Confirmed</option>
 <option value="Completed">Completed</option>
 <option value="Cancelled">Cancelled</option>
 </select>

 <button
 type="submit"
 className="px-4 py-2 rounded-control bg-primary text-white"
 >
 Search
 </button>
</div>
 </form>
 );
}