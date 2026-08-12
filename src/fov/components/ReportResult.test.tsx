import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { cameraFixture, lensFixture } from "../../../tests/fixtures";
import { calculateFov } from "../domain/fov";
import type { Camera, Lens } from "../domain/types";
import { ReportResult } from "./ReportResult";

describe("报告结果面板", () => {
  it("按报告顺序显示七项主参数并折叠技术详情", () => {
    const camera = { ...cameraFixture, nominalMegapixels: 16, sensorFormat: '1"', fps: 32, pixelSizeXUm: 2.6, pixelSizeYUm: 2.6 } as Camera;
    const lens = { ...lensFixture, depthOfFieldMm: 7, imageMtfLpMmMin: 120, depthOfFieldAperture: "F11" } as Lens;
    render(<ReportResult camera={camera} lens={lens} fov={calculateFov(camera, lens)} compatibility={{ status: "compatible", reasons: ["接口匹配，像圈完整覆盖传感器"] }} />);

    for (const label of ["CCD", "Sensor Size", "Lens", "FOV", "DOF", "Resolution", "Lens Resolution"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText('16M（1"）/ fps=32')).toBeInTheDocument();
    expect(screen.getByText("64.00 × 39.96 mm")).toBeInTheDocument();
    expect(screen.getByText("0.01250 mm/pixel")).toBeInTheDocument();
    expect(screen.getByText("1.46 mm")).toBeInTheDocument();
    expect(screen.getByText("7.00 mm × 0.208")).toBeInTheDocument();
    expect(screen.getByText("查看更多参数").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("兼容")).toBeInTheDocument();
  });

  it("复制完整七行报告并给出成功反馈", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const camera = { ...cameraFixture, nominalMegapixels: 16, sensorFormat: '1"', fps: 32 } as Camera;
    const lens = { ...lensFixture, depthOfFieldMm: 7, imageMtfLpMmMin: 120 } as Lens;
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ReportResult camera={camera} lens={lens} fov={calculateFov(camera, lens)} compatibility={{ status: "compatible", reasons: ["接口匹配，像圈完整覆盖传感器"] }} />);

    await user.click(screen.getByRole("button", { name: "复制报告参数" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledOnce();
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied.split("\n")).toHaveLength(7);
    expect(copied).toContain("Lens Resolution：");
  });
});
