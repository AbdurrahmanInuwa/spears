// One-off backfill: assign a SPAERS ID to any existing Citizen that doesn't
// have one yet. Safe to re-run.
require('dotenv').config();
const prisma = require('../lib/prisma');
const { generateUniqueSpaersId } = require('../lib/spaersId');

async function main() {
  const missing = await prisma.citizen.findMany({
    where: { spaersId: null },
    select: { id: true, email: true },
  });

  if (missing.length === 0) {
    console.log('No citizens missing a SPAERS ID.');
    return;
  }

  console.log(`Backfilling ${missing.length} citizen(s)…`);
  for (const c of missing) {
    const id = await generateUniqueSpaersId(prisma);
    await prisma.citizen.update({
      where: { id: c.id },
      data: { spaersId: id },
    });
    console.log(`  ${c.email} → ${id}`);
  }
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
