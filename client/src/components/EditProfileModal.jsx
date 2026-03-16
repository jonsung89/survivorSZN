import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { X, Camera, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import Cropper from 'react-easy-crop';
import Avatar from './Avatar';

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

export default function EditProfileModal({ onClose }) {
  const { user, updateProfile, uploadProfileImage, removeProfileImage } = useAuth();
  const { showToast } = useToast();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [imagePreview, setImagePreview] = useState(user?.profileImageUrl || null);
  const [imageData, setImageData] = useState(null);
  const [imageRemoved, setImageRemoved] = useState(false);
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
    setImageRemoved(false);
    setShowCropper(false);
    setRawImage(null);
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    setRawImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageData(null);
    setImageRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
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
      // Handle image changes
      if (imageData) {
        await uploadProfileImage(imageData);
      } else if (imageRemoved) {
        await removeProfileImage();
      }

      const result = await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.trim() || null
      });

      if (result.success) {
        showToast('Profile updated!', 'success');
        onClose();
      } else {
        setError(result.error || 'Failed to save profile');
      }
    } catch (err) {
      setError('Something went wrong');
    }

    setSaving(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-50">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="absolute inset-0 overflow-y-auto flex justify-center p-4">
        <div className="relative bg-elevated border border-fg/10 rounded-2xl w-full max-w-md p-6 animate-in my-auto h-fit">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-display font-bold text-fg">Edit Profile</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors"
            >
              <X className="w-5 h-5 text-fg/50" />
            </button>
          </div>

          <div className="space-y-4">
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
                    onClick={handleRemoveImage}
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
            <p className="text-fg/50 text-sm text-center">Tap to change profile photo</p>

            {/* First Name */}
            <div>
              <label className="block text-fg/80 text-sm font-medium mb-1">First name *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setError(''); }}
                placeholder="First name"
                className="w-full px-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/30 focus:outline-none focus:border-nfl-blue"
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
              <p className="text-fg/50 text-sm mt-1">2-20 characters</p>
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

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-lg bg-fg/5 text-fg/70 hover:bg-fg/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Save'
              )}
            </button>
          </div>
        </div>
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
    </>
  );
}
