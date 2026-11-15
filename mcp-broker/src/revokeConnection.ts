/** Run durable denial first. A failed cleanup is safe to retry. */
export async function revokeConnection(
  grant: string,
  owner: string,
  providerRevoke: (grant: string, owner: string) => Promise<void>,
  coordinateRevoke?: (grant: string, owner: string) => Promise<boolean>,
): Promise<boolean> {
  if (coordinateRevoke && !await coordinateRevoke(grant, owner)) return false;
  await providerRevoke(grant, owner);
  return true;
}
