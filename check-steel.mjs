import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: 'postgresql://cnc_user:cnc_password@59.4.248.240:5003/cnc_erp' });
const prisma = new PrismaClient({ adapter });

// Exact same query as availability API
const count = await prisma.steelPlan.count({
  where: {
    vesselCode: 'KYTS-1022',
    material: 'A',
    thickness: 9,
    width: 2140,
    length: 11400,
    status: 'RECEIVED',
    reservedFor: null,
  },
});
console.log('Count (RECEIVED, reservedFor=null):', count);

// Check without status/reservedFor filter
const countAll = await prisma.steelPlan.count({
  where: {
    vesselCode: 'KYTS-1022',
    material: 'A',
    thickness: 9,
    width: 2140,
    length: 11400,
  },
});
console.log('Count (no filters):', countAll);

// Get the actual record
const record = await prisma.steelPlan.findFirst({
  where: { vesselCode: 'KYTS-1022', material: 'A', thickness: 9, width: 2140, length: 11400 }
});
console.log('Record:', JSON.stringify(record, null, 2));

await prisma.$disconnect();
