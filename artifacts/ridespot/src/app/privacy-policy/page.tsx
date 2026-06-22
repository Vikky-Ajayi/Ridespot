import { Footer } from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4 md:px-6 lg:px-[14px]">
          <h1 className="text-[2.7rem] font-extrabold tracking-[-0.06em] text-ink md:text-[4.5rem]">
            Privacy Policy
          </h1>
          <div className="mt-8 space-y-6 text-[1rem] leading-8 text-ink-muted md:text-[1.05rem]">
            <p>
              RideSpot collects only the information needed to provide demand
              forecasting, account access, navigation support, and service updates.
            </p>
            <p>
              We use account details, location data, and device information to show
              hotspot recommendations, improve map accuracy, and notify drivers about
              relevant service activity.
            </p>
            <p>
              We do not sell driver personal data. Operational data is processed to
              deliver the product, maintain security, and improve forecasting quality.
            </p>
            <p>
              For privacy requests, corrections, or deletion inquiries, contact
              Info@ridespot.com.
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
