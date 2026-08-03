import { Footer } from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4 md:px-6 lg:px-[14px]">
          <h1 className="text-[2.7rem] font-extrabold tracking-[-0.06em] text-ink md:text-[4.5rem]">
            Terms of Service
          </h1>
          <div className="mt-8 space-y-6 text-[1rem] leading-8 text-ink-muted md:text-[1.05rem]">
            <p>
              RideSpot provides demand insights and hotspot recommendations to help
              drivers position more effectively. Drivers remain responsible for their
              own routing, driving decisions, and legal compliance while using the app.
            </p>
            <p>
              Availability, hotspot forecasts, and live demand signals may vary by
              city, traffic conditions, and platform activity. Forecasting data is
              advisory and not a guarantee of earnings.
            </p>
            <p>
              By using RideSpot, you agree not to misuse the service, attempt
              unauthorized access, or interfere with platform operations.
            </p>
            <p>
              For account, billing, or service questions, contact Info@ridespot.com.
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
