import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { DEFAULT_SETTINGS, mergeSettings } from "@/context/SettingsContext";

// Minimal router-compat mock for isolated component rendering
type MockLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "children"
> & {
  to?: string;
  children?:
    React.ReactNode | ((state: { isActive: boolean }) => React.ReactNode);
  end?: boolean;
};

vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children, ...rest }: MockLinkProps) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {typeof children === "function"
        ? children({ isActive: false })
        : children}
    </a>
  ),
  NavLink: ({ to, children, end: _end, ...rest }: MockLinkProps) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {typeof children === "function"
        ? children({ isActive: false })
        : children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useParams: () => ({}),
  useLocation: () => ({ pathname: "/", search: "" }),
}));

vi.mock("@/lib/useReveal", () => ({
  useReveal: () => {},
}));

vi.mock("@/lib/useSEO", () => ({
  useSEO: () => {},
}));

describe("IndiFunded UI & CMS updates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deep-merges settings without losing nested Trust labels or How It Works defaults", () => {
    const partial = {
      trust: {
        stats: [
          { label: "Total Amount Paid", value: "₹5,00,000" },
          { label: "Successful Payouts", value: "42" },
          { label: "Active Users", value: "310" },
          { label: "Total Traders", value: "900" },
        ],
      },
    };
    const merged = mergeSettings(DEFAULT_SETTINGS, partial);
    expect(merged.trust.stats[0].value).toBe("₹5,00,000");
    expect(merged.trust.labels.page_chip).toBe("Trust Center");
    expect(
      merged.how_it_works.process_paragraphs.length,
    ).toBeGreaterThanOrEqual(5);
    expect(merged.home_copy.weekly_heading).toBe(
      "This week's top winners, by plan",
    );
  });

  it("renders Challenges View Rules CTA pointing to /rules", async () => {
    const { api } = await import("@/lib/api");
    vi.spyOn(api, "get").mockResolvedValue({ data: [] } as never);
    const { default: Challenges } = await import("@/views/Challenges");

    render(<Challenges />);
    const btn = screen.getByTestId("challenges-view-rules-btn");
    expect(btn).toHaveAttribute("href", "/rules");
    expect(btn.textContent).toMatch(/View Rules/i);
  });

  it("renders Payouts page without Recent Payouts list", async () => {
    const { Payouts } = await import("@/views/SimplePages");
    render(<Payouts />);
    expect(screen.getByTestId("payouts-page")).toBeInTheDocument();
    expect(screen.queryByTestId("payout-item-0")).not.toBeInTheDocument();
  });

  it("renders HowItWorks steps and same-day funded process timeline", async () => {
    const { default: HowItWorks } = await import("@/components/HowItWorks");
    render(<HowItWorks />);
    const processBox = screen.getByTestId("how-it-works-process");
    expect(processBox.textContent).toContain(
      "As soon as you purchase a challenge, virtual funds will be credited to your dashboard",
    );
    expect(processBox.textContent).toContain(
      "Once you pass the challenge, you will receive your real funded account on the same day.",
    );
    expect(processBox.textContent).toContain("24 hours");
  });

  it("renders SuccessStories inside a right-to-left marquee track", async () => {
    const { SuccessStories } = await import("@/components/TrustSection");
    render(
      <SuccessStories
        stories={[
          {
            name: "Amit",
            city: "Surat",
            plan: "Pro",
            payout: "25000",
            story: "Smooth payout.",
          },
        ]}
      />,
    );
    const marquee = screen.getByTestId("success-stories-marquee");
    expect(marquee).toBeInTheDocument();
    expect(
      marquee.querySelector(".trust-stories-marquee-track"),
    ).toBeInTheDocument();
  });

  it("renders WeeklyHighestPayout inside a right-to-left horizontal marquee", async () => {
    const { api } = await import("@/lib/api");
    vi.spyOn(api, "get").mockResolvedValue({
      data: [
        {
          plan: "Standard",
          amount: 42000,
          trader_name: "Kiran",
          account_size: 200000,
        },
      ],
    } as never);
    const { default: WeeklyHighestPayout } =
      await import("@/components/WeeklyHighestPayout");
    render(<WeeklyHighestPayout />);
    await waitFor(() => {
      expect(
        screen.getByTestId("weekly-highest-payout-scroll"),
      ).toBeInTheDocument();
    });
    expect(
      screen
        .getByTestId("weekly-highest-payout-scroll")
        .querySelector(".whp-marquee-track"),
    ).toBeInTheDocument();
  });

  it("locks TradingTerminal symbol search input & button when no active account exists", async () => {
    const { api } = await import("@/lib/api");
    vi.spyOn(api, "get").mockResolvedValue({
      data: { marketStatus: "CLOSED", quotes: [], candles: [] },
    } as never);
    const { TradingTerminal } = await import("@/views/app/TraderScreens");
    render(<TradingTerminal embedded />);

    const input = screen.getByTestId("terminal-search-input");
    const searchBtn = screen.getByTestId("terminal-search-btn");
    expect(input).toBeDisabled();
    expect(searchBtn.textContent).toMatch(/Locked/i);

    fireEvent.click(searchBtn);
    await waitFor(() => {
      expect(screen.getByTestId("purchase-first-dialog")).toBeInTheDocument();
    });
  });

  it("renders CompanyDetails without TAN even if tan is present in settings", async () => {
    const { CompanyDetails } = await import("@/components/TrustSection");
    render(
      <CompanyDetails
        company={{
          legal_name: "BRVS Education Pvt Ltd",
          gst: "GSTIN-123",
          cin: "CIN-456",
          pan: "PAN-789",
          tan: "TAN-SHOULD-NOT-SHOW",
        }}
      />,
    );
    expect(screen.getByText("GST")).toBeInTheDocument();
    expect(screen.getByText("CIN")).toBeInTheDocument();
    expect(screen.getByText("PAN")).toBeInTheDocument();
    expect(screen.queryByText("TAN")).not.toBeInTheDocument();
    expect(screen.queryByText("TAN-SHOULD-NOT-SHOW")).not.toBeInTheDocument();
  });

  it("renders TraderStories without 'No stories yet' empty-state copy when user-submitted stories are empty", async () => {
    const { api } = await import("@/lib/api");
    vi.spyOn(api, "get").mockResolvedValue({ data: [] } as never);
    const { TraderStories } = await import("@/views/ExtraPages");
    render(<TraderStories />);
    await waitFor(() => {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/No stories yet/i)).not.toBeInTheDocument();
  });
});
