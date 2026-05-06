// One-off: replace every Citizen's spaersId with a freshly generated one
// using the current generator. Use this after changing the ID format.
require('dotenv').config();
const prisma = require('../lib/prisma');
const { generateUniqueSpaersId } = require('../lib/spaersId');

async function main() {
  const all = await prisma.citizen.findMany({
    select: { id: true, email: true, spaersId: true },
  });

  if (all.length === 0) {
    console.log('No citizens.');
    return;
  }

  // Clear all first so the unique check during generation has a clean slate
  await prisma.citizen.updateMany({ data: { spaersId: null } });

  console.log(`Regenerating ${all.length} citizen ID(s)…`);
  for (const c of all) {
    const id = await generateUniqueSpaersId(prisma);
    await prisma.citizen.update({
      where: { id: c.id },
      data: { spaersId: id },
    });
    console.log(`  ${c.email}: ${c.spaersId || '(none)'} → ${id}`);
  }
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
