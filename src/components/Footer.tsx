"use client";

import { Twitter, Github, Linkedin, Instagram } from "lucide-react";

export default function Footer() {
    return (
        <footer
            className="relative z-10 px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "#475569" }}
        >
            <span className="text-xs">
                © 2026-2027 Humayn. All Rights Reserved by <a href="https://ikashyap.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">Kashyap Rathod.</a>
            </span>

            <div className="flex items-center gap-5">
                {/* GitHub */}
                <a
                    href="https://github.com/ikashyaprathod"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-white"
                >
                    <Github size={16} />
                </a>

                {/* LinkedIn */}
                <a
                    href="https://www.linkedin.com/in/kashyaprathod"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-white"
                >
                    <Linkedin size={16} />
                </a>

                {/* Twitter / X */}
                <a
                    href="https://x.com/ikashyaprathod"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-white"
                >
                    <Twitter size={16} />
                </a>

                {/* Reddit */}
                <a
                    href="https://www.reddit.com/user/ikashyaprathod/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-white"
                >
                    <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="currentColor"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.056 1.597.04.21.065.424.065.642 0 2.442-3.39 4.414-7.569 4.414-4.18 0-7.569-1.972-7.569-4.414 0-.162.015-.322.046-.479-.665-.246-1.144-.882-1.144-1.63 0-.968.786-1.754 1.754-1.754.463 0 .884.18 1.196.471 1.21-.863 2.891-1.424 4.748-1.488l.852-4.004c.036-.168.181-.287.352-.287l2.844.598c.114-.306.411-.522.759-.522zM9.25 11.723c-.796 0-1.439.643-1.439 1.438 0 .796.643 1.439 1.439 1.439.795 0 1.438-.643 1.438-1.439 0-.795-.643-1.438-1.438-1.438zm5.5 0c-.795 0-1.438.643-1.438 1.438 0 .796.643 1.439 1.438 1.439.796 0 1.439-.643 1.439-1.439 0-.795-.643-1.438-1.439-1.438zm-5.518 4.298c-.114 0-.214.046-.285.122-.39.412-.422 1.058-.073 1.408.887.886 2.455.952 3.126.952.67 0 2.239-.066 3.125-.952.349-.35.317-.996-.073-1.408a.389.389 0 0 0-.285-.122.394.394 0 0 0-.203.056c-.004 0-.008.004-.012.008a3.1 3.1 0 0 1-2.553.869 3.1 3.1 0 0 1-2.552-.869.397.397 0 0 0-.203-.056z" />
                    </svg>
                </a>

                {/* ProductHunt */}
                <a
                    href="https://www.producthunt.com/@kashyaprathod"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-white"
                >
                    <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="currentColor"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm2.5 15.6h-2.1v-2.1h-2.1v2.1h-2.1V8.4h4.4c1.2 0 2.1.8 2.1 2.1v2.1c0 1.3-.9 2.1-2.1 2.1h-.1V15.6zm.1-5.1h-2.1v2.1h2.1v-2.1z" />
                    </svg>
                </a>

                {/* Instagram */}
                <a
                    href="https://www.instagram.com/ikashyaprathod/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-white"
                >
                    <Instagram size={17} />
                </a>
            </div>
        </footer>
    );
}
