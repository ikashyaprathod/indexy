"use server";

import { generateToken } from "@/lib/security";

/**
 * Server Action to get a fresh security token.
 * This runs on the server, keeping the secret hidden.
 */
export async function getApiToken() {
    return generateToken();
}
