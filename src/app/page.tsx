import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CheckerCard from "@/components/CheckerCard";
import ClientStarfield from "@/components/ClientStarfield";
import { CheckCircle, Activity, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <>
      {/* Three.js starfield - fixed behind everything */}
      <ClientStarfield />

      {/* Page wrapper */}
      <div
        className="relative flex flex-col min-h-screen max-w-[1300px] w-full mx-auto"
        style={{ zIndex: 1 }}
      >
        <Header />

        <main className="flex-1 flex flex-col items-center px-4 pt-28 pb-8">
          {/* Hero section */}
          <div className="text-center mb-12 max-w-3xl">

            <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-white mb-3">
              Instant Google{" "}
              <span className="gradient-text">Index Check</span>
            </h1>
          </div>

          {/* Main checker card */}
          <CheckerCard />

          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-8 mt-12 mb-8">
            <div className="flex items-center gap-2 text-[#475569]">
              <div className="w-8 h-8 rounded-lg bg-[#141925] flex items-center justify-center border border-white/[0.05]">
                <CheckCircle size={14} className="text-[#3b82f6]" />
              </div>
              <span className="text-[12px] font-bold tracking-wide">100% Accurate Data</span>
            </div>

            <div className="w-[1px] h-4 bg-white/5 hidden md:block" />

            <div className="flex items-center gap-2 text-[#475569]">
              <div className="w-8 h-8 rounded-lg bg-[#141925] flex items-center justify-center border border-white/[0.05]">
                <Activity size={14} className="text-[#10b981]" />
              </div>
              <span className="text-[12px] font-bold tracking-wide">0.4s Latency</span>
            </div>

            <div className="w-[1px] h-4 bg-white/5 hidden md:block" />

            <div className="flex items-center gap-2 text-[#475569]">
              <div className="w-8 h-8 rounded-lg bg-[#141925] flex items-center justify-center border border-white/[0.05]">
                <ShieldCheck size={14} className="text-[#6366f1]" />
              </div>
              <span className="text-[12px] font-bold tracking-wide">SSL Secured</span>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
