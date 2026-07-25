import { NextResponse } from 'next/server'
// The client condition is to use the server client here
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
        requestUrl.protocol = 'http:'
    }
    const { searchParams, origin } = requestUrl
    const code = searchParams.get('code')
    const nextParam = searchParams.get('next')
    const next = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            const forwardedHost = request.headers.get('x-forwarded-host') // i.e. local.betix.ai
            const isLocalEnv = process.env.NODE_ENV === 'development'

            if (isLocalEnv) {
                // we can safely redirect to origin in dev
                return NextResponse.redirect(`${origin}${next}`)
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`)
            } else {
                return NextResponse.redirect(`${origin}${next}`)
            }
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`)
}
