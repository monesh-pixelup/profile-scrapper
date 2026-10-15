import type { Metadata } from "next";
import { Dashboard } from "./Dashboard";

export const metadata: Metadata = {
  title: "ICP Dashboard · Profile Scrapper",
};

export default function DashboardPage() {
  return <Dashboard />;
}
