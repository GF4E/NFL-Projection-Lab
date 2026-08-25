"use server";

import { redirect } from "next/navigation";

export async function sendMagicLink(formData: FormData) {
  void formData;
  redirect("/sunday");
}
