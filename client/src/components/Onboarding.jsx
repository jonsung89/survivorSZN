import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Check, Loader2, Radio, Trophy, Users, MessageCircle, Mail, Camera, X, ZoomIn, ZoomOut } from 'lucide-react';
import Cropper from 'react-easy-crop';
import Avatar from './Avatar';
import BrandLogo from './BrandLogo';

// Generate cropped image from canvas
async function getCroppedImg(imageSrc, pixelCrop) {
  const image = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    200,
    200
  );

  return canvas.toDataURL('image/jpeg', 0.85);
}

export default function Onboarding() {
  const { user, updateProfile, uploadProfileImage, completeOnboarding } = useAuth();
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Crop state
  const [showCropper, setShowCropper] = useState(false);
  const [rawImage, setRawImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = useCallback((croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRawImage(ev.target.result);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = async () => {
    if (!croppedAreaPixels || !rawImage) return;
    const cropped = await getCroppedImg(rawImage, croppedAreaPixels);
    setImagePreview(cropped);
    setImageData(cropped);
    setShowCropper(false);
    setRawImage(null);
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    setRawImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveProfile = async () => {
    if (!firstName.trim()) {
      setError('First name is required');
      return;
    }
    if (!lastName.trim()) {
      setError('Last name is required');
      return;
    }
    if (!displayName.trim() || displayName.trim().length < 2) {
      setError('Display name must be at least 2 characters');
      return;
    }
    if (displayName.trim().length > 20) {
      setError('Display name must be 20 characters or less');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('A valid email address is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Upload image first if provided
      if (imageData) {
        await uploadProfileImage(imageData);
      }

      const result = await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.trim() || null
      });

      if (result.success) {
        setStep(2);
      } else {
        setError(result.error || 'Failed to save profile');
      }
    } catch (err) {
      setError('Something went wrong');
    }

    setSaving(false);
  };

  const handleComplete = () => {
    completeOnboarding();
  };

  return (
    <div className="fixed inset-0 bg-nfl-dark z-50 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
      <div className="w-full max-w-md my-8">
        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mb-8">
          <div className={`h-2 rounded-full transition-all ${step >= 1 ? 'bg-violet-500 w-8' : 'bg-fg/20 w-2'}`} />
          <div className={`h-2 rounded-full transition-all ${step >= 2 ? 'bg-violet-500 w-8' : 'bg-fg/20 w-2'}`} />
        </div>

        {step === 1 && (
          <div className="animate-in text-center">
            {/* Welcome Header */}
            <div className="mx-auto mb-6 w-fit">
              <BrandLogo size="xl" />
            </div>

            <h1 className="text-3xl font-display font-bold text-fg mb-2">
              Welcome to Survivor SZN!
            </h1>
            <p className="text-fg/60 mb-8">
              Let's set up your profile to get started
            </p>

            <div className="glass-card rounded-2xl p-6 text-left space-y-4 mb-6">
              {/* Profile Image */}
              <div className="flex justify-center mb-2">
                <div className="relative">
                  {imagePreview ? (
                    <div className="w-20 h-20 rounded-full overflow-hidden shadow-lg">
                      <img src={imagePreview} alt="Profile" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <Avatar
                      userId={user?.id}
                      name={firstName || displayName || '?'}
                      size="2xl"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-8 h-8 bg-nfl-blue rounded-full flex items-center justify-center text-white shadow-lg hover:bg-nfl-blue/80 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                </div>
              </div>
              <p className="text-fg/40 text-sm text-center">Add a profile photo (optional)</p>

              {/* First Name */}
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-1">First name *</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); setError(''); }}
                  placeholder="First name"
                  className="w-full px-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/30 focus:outline-none focus:border-nfl-blue"
                  autoFocus
                />
              </div>

              {/* Last Name */}
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-1">Last name *</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); setError(''); }}
                  placeholder="Last name"
                  className="w-full px-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/30 focus:outline-none focus:border-nfl-blue"
                />
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-1">Display name *</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => { setDisplayName(e.target.value); setError(''); }}
                  placeholder="How others see you in leagues"
                  className="w-full px-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/30 focus:outline-none focus:border-nfl-blue"
                  maxLength={20}
                />
                <p className="text-fg/40 text-sm mt-1">2-20 characters</p>
              </div>

              {/* Email */}
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-1">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/30 focus:outline-none focus:border-nfl-blue"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-1">Phone (optional)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError(''); }}
                  placeholder="Phone number"
                  className="w-full px-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/30 focus:outline-none focus:border-nfl-blue"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full btn-primary flex items-center justify-center gap-2 text-lg py-4"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in text-center">
            {/* Success Header */}
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-white" />
            </div>

            <h1 className="text-3xl font-display font-bold text-fg mb-2">
              You're all set, {displayName || firstName}!
            </h1>
            <p className="text-fg/50 italic text-sm mb-2" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              Built by a fan, for fans.
            </p>
            <p className="text-fg/50 text-sm mb-8">
              SurvivorSZN brings everything into one place so you don't have to jump between apps.
            </p>

            {/* Feature highlights */}
            <div className="space-y-4 mb-8">
              <div className="glass-card rounded-xl p-4 flex items-start gap-4 text-left">
                <div className="w-10 h-10 bg-fg/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Radio className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-fg font-semibold">Live Gamecast</h3>
                  <p className="text-fg/50 text-sm">Follow your favorite teams with live scores and play-by-play updates.</p>
                </div>
              </div>

              <div className="glass-card rounded-xl p-4 flex items-start gap-4 text-left">
                <div className="w-10 h-10 bg-fg/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Trophy className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-fg font-semibold">Leagues & Challenges</h3>
                  <p className="text-fg/50 text-sm">Create leagues for NFL Survivor, March Madness brackets, and more challenges coming soon.</p>
                </div>
              </div>

              <div className="glass-card rounded-xl p-4 flex items-start gap-4 text-left">
                <div className="w-10 h-10 bg-fg/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-fg font-semibold">Community</h3>
                  <p className="text-fg/50 text-sm">Invite friends and family, challenge them in leagues, and chat together all in one place.</p>
                </div>
              </div>
            </div>

            {/* Feedback CTA */}
            <div className="glass-card rounded-xl p-4 mb-8 text-left">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-fg/50 flex-shrink-0 mt-0.5" />
                <p className="text-fg/50 text-sm">
                  We'd love to hear from you! Share feedback, report bugs, or suggest features at{' '}
                  <a href="mailto:support@survivorszn.com" className="text-violet-400 hover:text-violet-300">support@survivorszn.com</a>
                </p>
              </div>
            </div>

            <p className="text-fg/50 text-sm mb-6">
              Start by exploring the Schedule page, watching a live gamecast, or creating a league!
            </p>

            <button
              onClick={handleComplete}
              className="w-full btn-primary flex items-center justify-center gap-2 text-lg py-4"
            >
              Let's Go!
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
      </div>

      {/* Image Crop Modal */}
      {showCropper && rawImage && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={handleCropCancel}
              className="text-white/70 hover:text-white transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <span className="text-white font-medium">Crop Photo</span>
            <button
              onClick={handleCropConfirm}
              className="text-violet-400 hover:text-violet-300 transition-colors text-sm font-bold"
            >
              Done
            </button>
          </div>

          {/* Crop area */}
          <div className="flex-1 relative">
            <Cropper
              image={rawImage}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          {/* Zoom control */}
          <div className="px-8 py-6 flex items-center gap-4">
            <ZoomOut className="w-4 h-4 text-white/50 flex-shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-violet-500 h-1"
            />
            <ZoomIn className="w-4 h-4 text-white/50 flex-shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
