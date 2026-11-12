import type { ReactNode } from "react";
import { Body, Container, Head, Html, Preview, Text } from "react-email";

export const EmailLayout = ({
  preview,
  language,
  direction,
  children,
}: {
  preview: string;
  language: string;
  direction: "ltr" | "rtl";
  children: ReactNode;
}) => (
  <Html lang={language} dir={direction}>
    <Head>
      <style>{`
        @media only screen and (max-width: 480px) {
          .email-heading { font-size: 30px !important; line-height: 36px !important; letter-spacing: -0.9px !important; }
        }
      `}</style>
    </Head>
    <Preview>{preview}</Preview>
    <Body
      style={{
        backgroundColor: "#f7f7f2",
        color: "#253c32",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
        margin: 0,
      }}
    >
      <Container style={{ maxWidth: "600px", margin: "40px auto", padding: "0 24px" }}>
        <Text
          style={{
            fontSize: "30px",
            lineHeight: "36px",
            fontWeight: 700,
            letterSpacing: "-1.5px",
            margin: "0 0 40px",
          }}
        >
          merit<span style={{ color: "#3d644a" }}>.</span>
        </Text>
        {children}
      </Container>
    </Body>
  </Html>
);
