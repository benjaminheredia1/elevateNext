import prisma from '../lib/prisma'
import bcrypt from 'bcryptjs'

async function main() {
  const email = 'benjaherediaruiz@gmail.com'
  const password = 'benja122'
  
  // Check if admin already exists
  const existingAdmin = await prisma.usuario.findUnique({
    where: { email }
  })

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(password, 10)
    
    await prisma.usuario.create({
      data: {
        nombre: 'Admin',
        apellido_paterno: 'Sistema',
        apellido_materno: '',
        email: email,
        password: passwordHash,
        token: '',
        rol: 'ADMIN'
      }
    })
    console.log(`✅ Default admin created: ${email}`)
  } else {
    console.log(`ℹ️ Admin already exists: ${email}`)
    
    // Ensure rol is ADMIN
    if (existingAdmin.rol !== 'ADMIN') {
      await prisma.usuario.update({
        where: { email },
        data: { rol: 'ADMIN' }
      })
      console.log(`✅ Updated existing user to ADMIN role`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
