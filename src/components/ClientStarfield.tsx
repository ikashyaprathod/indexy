"use client";

import dynamic from "next/dynamic";

const StarfieldCanvas = dynamic(() => import("./StarfieldCanvas"), {
    ssr: false,
    loading: () => null,
});

export default function ClientStarfield() {
    return <StarfieldCanvas />;
}
