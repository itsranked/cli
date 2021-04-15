export default function getFileName(outputDir: string, prefix: string, shortName: string) {
  const fileName = `top100-${prefix}-${shortName}.json`;

  return outputDir + fileName;
}
