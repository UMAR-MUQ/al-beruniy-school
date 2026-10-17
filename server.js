const express = require('express')
const path    = require('path')

const app  = express()
const PORT = process.env.PORT || 3000

// Serve all static files from current directory
app.use(express.static(path.join(__dirname)))

// All routes → index.html (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Al Beruniy School Portal running on port ${PORT}`)
})
