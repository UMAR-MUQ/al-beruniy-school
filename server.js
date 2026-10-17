const express    = require('express')
const path       = require('path')
const compression= require('compression')
const { createClient } = require('@supabase/supabase-js')

const app  = express()
const PORT = process.env.PORT || 3000

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

app.use(compression())
app.use(express.json())
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, fp) => {
    if (fp.endsWith('.html')) res.setHeader('Cache-Control','no-cache')
    else if (fp.endsWith('.css')||fp.endsWith('.js')) res.setHeader('Cache-Control','public,max-age=604800')
  }
}))

/* ────────────────────────────────────────
   TEACHERS
──────────────────────────────────────── */
// Register
app.post('/api/teachers/register', async (req, res) => {
  const { ism, familiya, fan, parol } = req.body
  if (!ism||!familiya||!fan||!parol) return res.status(400).json({ error:'All fields required' })

  const { data: existing } = await supabase
    .from('teachers')
    .select('id')
    .ilike('ism', ism).ilike('familiya', familiya).eq('fan', fan)
    .single()

  if (existing) return res.status(409).json({ error:'Teacher already registered' })

  const teacher = { id:'t_'+Date.now(), ism, familiya, fan, parol }
  const { error } = await supabase.from('teachers').insert(teacher)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true, teacher })
})

// Login
app.post('/api/teachers/login', async (req, res) => {
  const { ism, familiya, fan, parol } = req.body
  if (!ism||!familiya||!fan||!parol) return res.status(400).json({ error:'All fields required' })

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .ilike('ism', ism).ilike('familiya', familiya).eq('fan', fan).eq('parol', parol)
    .single()

  if (!teacher) {
    // check if name+fan exists (wrong password)
    const { data: byName } = await supabase
      .from('teachers').select('id').ilike('ism', ism).ilike('familiya', familiya).eq('fan', fan).single()
    if (byName) return res.status(401).json({ error:'Incorrect password' })

    const { data: byNameOnly } = await supabase
      .from('teachers').select('id,fan').ilike('ism', ism).ilike('familiya', familiya).single()
    if (byNameOnly) return res.status(401).json({ error:'Incorrect subject' })

    return res.status(401).json({ error:'Teacher not found. Please register first.' })
  }
  res.json({ success: true, teacher })
})

/* ────────────────────────────────────────
   TESTS
──────────────────────────────────────── */
// Get all tests (optionally filter by sinf+harf)
app.get('/api/tests', async (req, res) => {
  const { sinf, harf } = req.query
  let query = supabase.from('tests').select('*').order('created_at', { ascending: false })
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  let tests = data || []
  if (sinf && harf) {
    tests = tests.filter(t =>
      (t.sinf === sinf || t.harf === 'All') &&
      (t.harf === harf || t.harf === 'All')
    )
  }
  res.json(tests)
})

// Get tests by teacher
app.get('/api/tests/teacher/:teacherId', async (req, res) => {
  const { data, error } = await supabase
    .from('tests').select('*').eq('teacher_id', req.params.teacherId)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// Create test
app.post('/api/tests', async (req, res) => {
  const { teacherId, teacherName, fan, nomi, sinf, harf, questions } = req.body
  if (!teacherId||!nomi||!sinf||!harf||!questions?.length)
    return res.status(400).json({ error:'Missing required fields' })

  const test = {
    id: 'ts_'+Date.now(),
    teacher_id: teacherId,
    teacher_name: teacherName,
    fan, nomi, sinf, harf, questions,
    created_at: new Date().toISOString()
  }
  const { error } = await supabase.from('tests').insert(test)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true, test })
})

// Delete test
app.delete('/api/tests/:id', async (req, res) => {
  const { error } = await supabase.from('tests').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

/* ────────────────────────────────────────
   RESULTS
──────────────────────────────────────── */
// Get results by teacher
app.get('/api/results/teacher/:teacherId', async (req, res) => {
  // Get teacher's test IDs first
  const { data: tests } = await supabase
    .from('tests').select('id').eq('teacher_id', req.params.teacherId)
  if (!tests?.length) return res.json([])

  const testIds = tests.map(t => t.id)
  const { data, error } = await supabase
    .from('results').select('*').in('test_id', testIds)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// Check if student already submitted
app.get('/api/results/check', async (req, res) => {
  const { testId, studentName, sinf, harf } = req.query
  const { data } = await supabase
    .from('results').select('id')
    .eq('test_id', testId)
    .ilike('student_name', studentName)
    .eq('sinf', sinf).eq('harf', harf)
    .single()
  res.json({ exists: !!data })
})

// Submit result
app.post('/api/results', async (req, res) => {
  const { testId, testNomi, teacherId, studentName, sinf, harf, score, total, pct, grade, answers } = req.body

  // duplicate guard
  const { data: existing } = await supabase
    .from('results').select('id')
    .eq('test_id', testId).ilike('student_name', studentName)
    .eq('sinf', sinf).eq('harf', harf).single()
  if (existing) return res.status(409).json({ error:'Already submitted' })

  const result = {
    id: 'r_'+Date.now(),
    test_id: testId, test_nomi: testNomi, teacher_id: teacherId,
    student_name: studentName, sinf, harf,
    score, total, pct, grade, answers,
    time: Date.now(),
    date_str: new Date().toLocaleString('en')
  }
  const { error } = await supabase.from('results').insert(result)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true, result })
})

/* ────────────────────────────────────────
   MISC
──────────────────────────────────────── */
app.get('/ping', (req, res) => res.send('OK'))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Al Beruniy School Portal running on port ${PORT}`)
})
