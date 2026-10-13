import { redirect } from "next/navigation";

// The resource list is the home page. It sends visitors to sign in.
export default function Home() {
  redirect("/resources");
}
