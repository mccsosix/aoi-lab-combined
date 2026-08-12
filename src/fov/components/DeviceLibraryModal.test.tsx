import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { cameraFixture, lensFixture } from "../../../tests/fixtures";
import type { Camera, Lens } from "../domain/types";
import type { DefaultDeviceData, DeviceRepository } from "../storage/db";
import { DeviceLibraryModal } from "./DeviceLibraryModal";
import { FovWorkbench } from "./FovWorkbench";

function repository(seed: DefaultDeviceData): DeviceRepository {
  let cameras: Camera[] = [...seed.cameras]; let lenses: Lens[] = [...seed.lenses];
  return {
    async initializeDefaults() {}, async listCameras() { return cameras; }, async listLenses() { return lenses; },
    async saveCamera(item) { cameras = cameras.filter((entry) => entry.id !== item.id).concat(item); },
    async saveLens(item) { lenses = lenses.filter((entry) => entry.id !== item.id).concat(item); },
    async hideDefaultRecord() {}, async deleteUserRecord() {}, async resetDefaults() { cameras = []; lenses = []; },
  };
}

describe("设备资料库界面", () => {
  it("阻止零倍率并在保存后保留现场镜头", async () => {
    const data = { cameras: [cameraFixture], lenses: [lensFixture] };
    const user = userEvent.setup();
    render(<FovWorkbench repository={repository(data)} defaultData={data} />);
    await user.click(await screen.findByRole("button", { name: "设备资料库" }));
    await user.click(screen.getByRole("button", { name: /镜头（/ }));
    await user.click(screen.getByRole("button", { name: "新增镜头" }));
    await user.type(screen.getByLabelText("品牌"), "现场品牌");
    await user.type(screen.getByLabelText("型号"), "CUSTOM-0208");
    await user.click(screen.getByRole("button", { name: "保存设备" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("倍率必须大于 0");
    await user.type(screen.getByLabelText("倍率"), "0.208");
    await user.click(screen.getByRole("button", { name: "保存设备" }));
    expect(await screen.findByText("CUSTOM-0208")).toBeInTheDocument();
  });

  it("新增相机时保存报告需要的 Sensor Size 资料", async () => {
    const onSaveCamera = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<DeviceLibraryModal open onClose={() => {}} cameras={[]} lenses={[]} onSaveCamera={onSaveCamera} onSaveLens={vi.fn()} onRemove={vi.fn()} onReset={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "新增相机" }));
    for (const [label, value] of [
      ["品牌", "海康机器人"], ["型号", "MV-TEST"], ["水平像素", "5120"], ["垂直像素", "5120"],
      ["传感器宽（mm）", "12.8"], ["传感器高（mm）", "12.8"], ["名义像素（M）", "25"],
      ["Sensor 光学格式", '1.1"'], ["帧率（fps）", "14.3"], ["水平像元（μm）", "2.5"], ["垂直像元（μm）", "2.5"],
      ["Sensor 型号", "GMAX0505"],
    ]) await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole("button", { name: "保存设备" }));
    await waitFor(() => expect(onSaveCamera).toHaveBeenCalledOnce());
    expect(onSaveCamera.mock.calls[0][0]).toMatchObject({ nominalMegapixels: 25, sensorFormat: '1.1"', fps: 14.3, pixelSizeXUm: 2.5, pixelSizeYUm: 2.5, sensorModel: "GMAX0505" });
  });

  it("新增镜头时保存 DOF、MTF 与标称靶面资料", async () => {
    const onSaveLens = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<DeviceLibraryModal open onClose={() => {}} cameras={[]} lenses={[]} onSaveCamera={vi.fn()} onSaveLens={onSaveLens} onRemove={vi.fn()} onReset={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /镜头（/ }));
    await user.click(screen.getByRole("button", { name: "新增镜头" }));
    for (const [label, value] of [
      ["品牌", "测试镜头"], ["型号", "DTCM-TEST"], ["倍率", "0.208"], ["镜头标称靶面", '1"'],
      ["镜头 MTF（lp/mm）", "135"], ["资料 DOF（mm）", "14.8"], ["DOF 光圈", "F16"], ["最佳光圈", "F8"],
    ]) await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByLabelText("DOF 为 ± 范围"));
    await user.click(screen.getByRole("button", { name: "保存设备" }));
    await waitFor(() => expect(onSaveLens).toHaveBeenCalledOnce());
    expect(onSaveLens.mock.calls[0][0]).toMatchObject({ sensorFormat: '1"', imageMtfLpMmMin: 135, depthOfFieldMm: 14.8, depthOfFieldAperture: "F16", aperture: "F8", depthOfFieldSymmetric: true });
  });
});
