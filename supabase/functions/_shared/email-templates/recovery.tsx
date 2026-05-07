/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your password for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          We received a request to reset your password for {siteName}. Click
          the button below to choose a new password.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Reset Password
        </Button>
        <Text style={footer}>
          If you didn't request a password reset, you can safely ignore this
          email. Your password will not be changed.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: "#ffffff", fontFamily: "\"Helvetica Neue\", Helvetica, Arial, sans-serif", color: "#1a1d22" }
const container = { padding: "40px 32px", maxWidth: "560px" }
const h1 = { fontSize: "28px", fontWeight: 500 as const, color: "#1a1d22", fontFamily: "Georgia, \"Times New Roman\", serif", margin: "0 0 24px", letterSpacing: "-0.01em" }
const text = { fontSize: "15px", color: "#3a3d44", lineHeight: "1.65", margin: "0 0 24px" }
const link = { color: "#c5a26a", textDecoration: "underline" }
const button = { backgroundColor: "#1a1d22", color: "#f7f5f2", fontSize: "14px", borderRadius: "8px", padding: "14px 28px", textDecoration: "none", letterSpacing: "0.02em" }
const codeStyle = { fontFamily: "Courier, monospace", fontSize: "26px", fontWeight: "bold" as const, color: "#1a1d22", letterSpacing: "0.3em", margin: "0 0 30px" }
const footer = { fontSize: "12px", color: "#8a8d94", margin: "32px 0 0", borderTop: "1px solid #ececec", paddingTop: "20px" }
