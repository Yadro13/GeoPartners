type SizedFile = { name: string; size: number };

export function packFileGroupsByLimits<T extends SizedFile>(groups: T[][], limits: { files: number; bytes: number }): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const group of groups) {
    const groupBytes = group.reduce((sum, file) => sum + file.size, 0);
    if (group.length > limits.files || groupBytes > limits.bytes) {
      throw new Error(`${group[0]?.name ?? "Файл"}: пов'язаний набір перевищує ліміт одного технічного пакета.`);
    }
    if (current.length && (current.length + group.length > limits.files || currentBytes + groupBytes > limits.bytes)) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(...group);
    currentBytes += groupBytes;
  }

  if (current.length) batches.push(current);
  return batches;
}
