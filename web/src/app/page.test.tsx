import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));
vi.mock("@/components/PublicHeader", () => ({ default: () => <header>ENGLISHGO</header> }));
import HomePage from "./page";

beforeEach(() => { vi.resetAllMocks(); });
describe("homepage cold-load auth path", () => {
  it("renders the public page without reading a Firestore profile", async () => {
    render(await HomePage());
    expect(screen.getAllByRole("link", { name: /Bắt đầu/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
