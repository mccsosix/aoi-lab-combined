import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { cameraFixture, lensFixture } from "../../../tests/fixtures";
import type { Camera, Lens } from "../domain/types";
import type { DefaultDeviceData, DeviceRepository } from "../storage/db";
import { FovWorkbench } from "./FovWorkbench";

function memoryRepository(seed: DefaultDeviceData): DeviceRepository {
  let cameras: Camera[] = [...seed.cameras];
  let lenses: Lens[] = [...seed.lenses];
  return {
    async initializeDefaults(data) {
      for (const item of data.cameras) if (!cameras.some((entry) => entry.id === item.id)) cameras.push(item);
      for (const item of data.lenses) if (!lenses.some((entry) => entry.id === item.id)) lenses.push(item);
    },
    async listCameras() { return cameras; }, async listLenses() { return lenses; },
    async saveCamera(item) { cameras = cameras.filter((entry) => entry.id !== item.id).concat(item); },
    async saveLens(item) { lenses = lenses.filter((entry) => entry.id !== item.id).concat(item); },
    async hideDefaultRecord(kind, id) {
      if (kind === "camera") cameras = cameras.map((item) => item.id === id ? { ...item, hidden: true } : item);
      else lenses = lenses.map((item) => item.id === id ? { ...item, hidden: true } : item);
    },
    async deleteUserRecord(kind, id) {
      if (kind === "camera") cameras = cameras.filter((item) => item.id !== id);
      else lenses = lenses.filter((item) => item.id !== id);
    },
    async resetDefaults() { cameras = []; lenses = []; },
  };
}

describe("FOV 工作台", () => {
  it("选择相机和镜头后分别展示数学结果与物理兼容性", async () => {
    const data = { cameras: [cameraFixture], lenses: [lensFixture] };
    render(<FovWorkbench repository={memoryRepository(data)} defaultData={data} />);
    expect(await screen.findByText("64.00 × 39.96 mm")).toBeInTheDocument();
    expect(screen.getByText(/12.50 μm\/px/)).toBeInTheDocument();
    expect(screen.getAllByText("兼容").length).toBeGreaterThan(0);
  });

  it("按目标推荐只显示完整覆盖的组合并能带回组合计算", async () => {
    const data = {
      cameras: [
        { ...cameraFixture, id: "near", model: "NEAR-CAM", sensorWidthMm: 9.1, sensorHeightMm: 5.1 },
        { ...cameraFixture, id: "short", model: "SHORT-CAM", sensorWidthMm: 9, sensorHeightMm: 4.9 },
      ],
      lenses: [{ ...lensFixture, magnification: 0.1 }],
    };
    const user = userEvent.setup();
    render(<FovWorkbench repository={memoryRepository(data)} defaultData={data} />);
    await user.click(await screen.findByRole("button", { name: "按目标推荐" }));
    await user.clear(screen.getByLabelText("目标宽度（mm）"));
    await user.type(screen.getByLabelText("目标宽度（mm）"), "90");
    await user.clear(screen.getByLabelText("目标高度（mm）"));
    await user.type(screen.getByLabelText("目标高度（mm）"), "50");
    await user.click(screen.getByRole("button", { name: "查找完整覆盖组合" }));
    expect(await screen.findByText("NEAR-CAM")).toBeInTheDocument();
    expect(screen.queryByText("SHORT-CAM")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /查看 NEAR-CAM/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "组合计算" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("默认隐藏明确不兼容镜头并可切换显示", async () => {
    const data = {
      cameras: [cameraFixture],
      lenses: [
        { ...lensFixture, id: "ok", model: "LENS-OK", maxSensorDiagonalMm: 16 },
        { ...lensFixture, id: "small", model: "LENS-SMALL", maxSensorDiagonalMm: 10 },
      ],
    };
    const user = userEvent.setup();
    render(<FovWorkbench repository={memoryRepository(data)} defaultData={data} />);
    expect(await screen.findByRole("option", { name: /LENS-OK/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /LENS-SMALL/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "显示不兼容镜头" }));
    expect(screen.getByRole("option", { name: /LENS-SMALL/ })).toBeInTheDocument();
  });
});
