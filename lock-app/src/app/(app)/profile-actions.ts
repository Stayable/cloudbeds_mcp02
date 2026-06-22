"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, logout } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function signOutAction() {
  await logout();
  redirect("/login");
}

export async function markSeenAction() {
  const user = await getSession();
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { notificationsSeenAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function saveNotificationPrefsAction(formData: FormData) {
  const user = await getSession();
  if (!user) return;
  const prefs = {
    offline: formData.get("offline") === "on",
    low_battery: formData.get("low_battery") === "on",
    door_left_open: formData.get("door_left_open") === "on",
    email: formData.get("email") === "on",
  };
  await prisma.user.update({ where: { id: user.id }, data: { notificationPrefs: prefs } });
  revalidatePath("/", "layout");
}
