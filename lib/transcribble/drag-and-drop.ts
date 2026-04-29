type FileDragLike = Pick<DataTransfer, "files" | "types">;

export function hasExternalFileDrag(dataTransfer: FileDragLike | null | undefined) {
  if (!dataTransfer) {
    return false;
  }

  const types = Array.from(dataTransfer.types ?? []);
  if (types.includes("Files")) {
    return true;
  }

  return (dataTransfer.files?.length ?? 0) > 0;
}
