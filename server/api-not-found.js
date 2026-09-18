export const apiNotFound = (_req, res) =>
  res.status(404).json({ message: "接口不存在" });

