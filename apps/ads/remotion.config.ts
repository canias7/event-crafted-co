import { Config } from "@remotion/cli/config";

// High-quality output for ads.
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(null); // auto
Config.setCodec("h264");
Config.setCrf(18); // lower = higher quality (18 is visually lossless-ish)
