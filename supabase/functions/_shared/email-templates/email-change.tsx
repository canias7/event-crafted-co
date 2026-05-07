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

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email change for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm your email change</Heading>
        <Text style={text}>
          You requested to change your email address for {siteName} from{' '}
          <Link href={`mailto:${oldEmail}`} style={link}>
            {oldEmail}
          </Link>{' '}
          to{' '}
          <Link href={`mailto:${newEmail}`} style={link}>
            {newEmail}
          </Link>
          .
        </Text>
        <Text style={text}>
          Click the button below to confirm this change:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirm Email Change
        </Button>
        <Text style={footer}>
          If you didn't request this change, please secure your account
          immediately.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = { backgroundColor: "#ffffff", fontFamily: "\"Helvetica Neue\", Helvetica, Arial, sans-serif", color: "#1a1d22" }
const container = { padding: "40px 32px", maxWidth: "560px" }
const h1 = { fontSize: "28px", fontWeight: 500 as const, color: "#1a1d22", fontFamily: "Georgia, \"Times New Roman\", serif", margin: "0 0 24px", letterSpacing: "-0.01em" }
const text = { fontSize: "15px", color: "#3a3d44", lineHeight: "1.65", margin: "0 0 24px" }
const link = { color: "#c5a26a", textDecoration: "underline" }
const button = { backgroundColor: "#1a1d22", color: "#f7f5f2", fontSize: "14px", borderRadius: "8px", padding: "14px 28px", textDecoration: "none", letterSpacing: "0.02em" }
const codeStyle = { fontFamily: "Courier, monospace", fontSize: "26px", fontWeight: "bold" as const, color: "#1a1d22", letterSpacing: "0.3em", margin: "0 0 30px" }
const footer = { fontSize: "12px", color: "#8a8d94", margin: "32px 0 0", borderTop: "1px solid #ececec", paddingTop: "20px" }
