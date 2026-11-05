import { notFound, redirect } from "next/navigation";

export default function MusicTrialPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  redirect("/music");
}
