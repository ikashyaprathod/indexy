"use server";

import { cookies } from "next/headers";
import { signToken, verifyToken } from "@/lib/auth";

const ADMIN_PIN = process.env.ADMIN_PIN || "2026";
const PIN_SESSION_NAME = "indexy_admin_authorized";

export async function verifyAdminPasskey(pin: string) {
    // Artificial delay to prevent brute-force attacks
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (pin === ADMIN_PIN) {
        const token = await signToken({
            userId: 0, // System user
            email: "internal@indexy.system",
            name: "Authorized Admin",
            role: "admin_verified"
        });

        const cookieStore = await cookies();
        cookieStore.set(PIN_SESSION_NAME, "true", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 60 * 60 * 2, // 2 hours
            path: "/admin",
        });

        return { success: true };
    }

    return { success: false, error: "Invalid Security Passkey" };
}

export async function checkAdminAuthorization() {
    const cookieStore = await cookies();
    const isAuthorized = cookieStore.get(PIN_SESSION_NAME)?.value === "true";
    return isAuthorized;
}
