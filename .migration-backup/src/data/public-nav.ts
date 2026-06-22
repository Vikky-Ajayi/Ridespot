export interface PublicNavItem {
  label: string;
  href: string;
}

export const publicNavItems: PublicNavItem[] = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Faq", href: "/#faq" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Contact", href: "/contact" }
];

export const publicNavCta = {
  label: "Get Started",
  href: "/register"
} as const;
