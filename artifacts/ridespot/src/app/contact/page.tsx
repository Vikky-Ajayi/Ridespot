

import { zodResolver } from "@hookform/resolvers/zod";

import { Mail, Phone } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CtaSection } from "@/components/landing/CtaSection";
import { Footer } from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { contactRepository } from "@/services/repositories";

const contactSchema = z.object({
  fullName: z.string().min(2, "Please enter your full name."),
  email: z.string().email("Please enter a valid email address."),
  message: z.string().min(10, "Please tell us how we can help.")
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function ContactPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      fullName: "",
      email: "",
      message: ""
    }
  });

  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="py-14 md:py-24">
        <div className="mx-auto max-w-5xl px-4 md:px-6 lg:px-[14px]">
          <div className="mx-auto max-w-[61.5rem]">
            <div className="md:hidden">
              <div className="relative w-fit max-w-full pr-[4.9rem]">
                <h1 className="text-[2.9rem] font-extrabold leading-[0.9] tracking-[-0.08em] text-ink">
                  <span className="block whitespace-nowrap">Get in touch with</span>
                  <span className="block whitespace-nowrap">us anytime</span>
                </h1>
                <div className="absolute right-[0.15rem] top-[2.45rem]">
                  <img
                    src="/assets/contact-hands.png"
                    alt=""
                    className="h-auto w-[4.75rem]"
                  />
                </div>
              </div>
              <p className="mt-3 max-w-[20.75rem] text-[0.98rem] leading-[1.18] tracking-[-0.02em] text-ink-muted">
                Have questions about ridespot or want to partner with us? Reach out below and we&apos;ll get back to you shortly
              </p>
            </div>
            <div className="relative mx-auto hidden w-fit pr-[6.6rem] md:block md:translate-x-[2rem]">
              <h1 className="text-center text-[4.45rem] font-extrabold leading-[0.86] tracking-[-0.085em] text-ink">
                <span className="block whitespace-nowrap">Get in touch</span>
                <span className="block whitespace-nowrap">with us anytime</span>
              </h1>
              <div className="absolute right-0 top-[0.55rem]">
                <img
                  src="/assets/contact-hands.png"
                  alt=""
                  className="h-auto w-[6.85rem]"
                />
              </div>
            </div>
            <p className="mx-auto hidden max-w-[29.75rem] text-center text-[1.05rem] leading-[1.32] tracking-[-0.03em] text-ink-muted md:mt-[1.35rem] md:block">
              Have questions about ridespot or want to partner with us? Reach out
              below and we&apos;ll get back to you shortly
            </p>
          </div>
          <div className="mt-7 flex flex-col gap-[0.95rem] text-[1rem] font-semibold text-brand-deep md:mx-auto md:mt-[1.9rem] md:max-w-[40rem] md:flex-row md:items-center md:justify-center md:gap-[3rem] md:text-[1.05rem]">
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-canvas-subtle text-ink md:size-[2.7rem]">
                <Mail className="size-5 md:size-[1.05rem]" />
              </span>
              Info@ridespot.com
            </span>
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-canvas-subtle text-ink md:size-[2.7rem]">
                <Phone className="size-5 md:size-[1.05rem]" />
              </span>
              +44 8292 2920 191
            </span>
          </div>
          <form
            className="mx-auto mt-12 max-w-[40rem] space-y-6"
            onSubmit={handleSubmit(async (values) => {
              await contactRepository.submitContact(values);
            })}
          >
            <Input
              label="Full Name"
              placeholder="e.g John Doe"
              error={errors.fullName?.message}
              {...register("fullName")}
            />
            <Input
              label="Email address"
              placeholder="e.g Johndoe@email.com"
              error={errors.email?.message}
              {...register("email")}
            />
            <Input
              label="Message"
              placeholder="How can we be of help"
              error={errors.message?.message}
              multiline
              rows={5}
              {...register("message")}
            />
            <div className="flex justify-center pt-2">
              <Button
                type="submit"
                fullWidth
                loading={isSubmitting}
                className="rounded-2xl md:w-auto md:min-w-[10rem] md:px-8"
              >
                Send Message
              </Button>
            </div>
          </form>
        </div>
      </section>
      <CtaSection />
      <Footer />
    </main>
  );
}
