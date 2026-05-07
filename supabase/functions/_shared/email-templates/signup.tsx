/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm your email</Heading>
        <Text style={text}>
          Thanks for signing up for{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          !
        </Text>
        <Text style={text}>
          Please confirm your email address (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) by clicking the button below:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Verify Email
        </Button>
        <Text style={footer}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: '#1a1d22' }
const container = { padding: '40px 32px', maxWidth: '560px' }
const h1 = { fontSize: '28px', fontWeight: 500 as const, color: '#1a1d22', fontFamily: 'Georgia, "Times New Roman", serif', margin: '0 0 24px', letterSpacing: '-0.01em' }
const text = { fontSize: '15px', color: '#3a3d44', lineHeight: '1.65', margin: '0 0 24px' }
const link = { color: '#c5a26a', textDecoration: 'underline' }
const button = { backgroundColor: '#1a1d22', color: '#f7f5f2', fontSize: '14px', borderRadius: '8px', padding: '14px 28px', textDecoration: 'none', letterSpacing: '0.02em' }
const footer = { fontSize: '12px', color: '#8a8d94', margin: '32px 0 0', borderTop: '1px solid #ececec', paddingTop: '20px' }
