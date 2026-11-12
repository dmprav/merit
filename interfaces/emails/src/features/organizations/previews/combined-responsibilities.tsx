import { InvitationEmail } from "../invitation";
import { invitationFixtures } from "../invitation.fixtures";
import { EmailMessagesProvider } from "../messages";

const Preview = () => (
  <EmailMessagesProvider>
    <InvitationEmail {...invitationFixtures.combined} />
  </EmailMessagesProvider>
);

export default Preview;
