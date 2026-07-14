import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));

import NewAssetPage from "../../app/assets/[type]/new/page";
import EditAssetPage from "../../app/assets/[type]/[id]/edit/page";
import NewProposalPage from "../../app/proposals/new/page";

describe("MCP-managed write routes", () => {
  beforeEach(() => redirect.mockClear());

  it("redirects direct asset creation URLs to the scoped list", async () => {
    await NewAssetPage({
      params: Promise.resolve({ type: "apis" }),
      searchParams: Promise.resolve({ scope: "com.huawei.celon.policyhub", q: "write" })
    });

    expect(redirect).toHaveBeenCalledWith("/assets/apis?scope=com.huawei.celon.policyhub&q=write");
  });

  it("redirects direct asset edit URLs to the scoped detail", async () => {
    await EditAssetPage({
      params: Promise.resolve({ type: "apis", id: "policy-api" }),
      searchParams: Promise.resolve({ scope: "com.huawei.celon.policyhub" })
    });

    expect(redirect).toHaveBeenCalledWith("/assets/apis/policy-api?scope=com.huawei.celon.policyhub");
  });

  it("redirects direct proposal creation URLs to the scoped list", async () => {
    await NewProposalPage({
      searchParams: Promise.resolve({ scope: "com.huawei.celon.policyhub" })
    });

    expect(redirect).toHaveBeenCalledWith("/proposals?scope=com.huawei.celon.policyhub");
  });
});
