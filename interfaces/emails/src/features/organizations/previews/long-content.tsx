import { InvitationEmail } from "../invitation";
import { invitationFixtures } from "../invitation.fixtures";
import { EmailMessagesProvider } from "../messages";

const Preview = () => (
  <EmailMessagesProvider>
    <InvitationEmail {...invitationFixtures.longContent} />
  </EmailMessagesProvider>
);

export default Preview;
