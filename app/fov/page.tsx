import type { Metadata } from "next";
import { FovWorkbench } from "../../src/fov/components/FovWorkbench";

export const metadata: Metadata = {
  title: "FOV 相机与镜头选型 · AOI LAB",
  description: "组合计算 FOV，或按目标尺寸推荐完整覆盖的相机与镜头组合。",
};

export default function FovPage() { return <FovWorkbench />; }
